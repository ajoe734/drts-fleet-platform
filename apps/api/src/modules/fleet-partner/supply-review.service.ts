import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  SupplyReviewActionCommand,
  SupplySubmissionRecord,
  SupplySubmissionStatus,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import {
  SupplySubmissionRepository,
  type SupplyReviewEventRecord,
} from "./supply-submission.repository";

const REVIEW_SUBMISSION_SEED: SupplySubmissionRecord[] = [
  {
    submissionId: "sup-sub-demo-001",
    fleetPartnerId: "fleet-demo-001",
    submissionType: "driver_onboarding",
    status: "submitted",
    revisionNo: 1,
    subjectDriverId: null,
    subjectVehicleId: null,
    submittedBy: "fleet-user-1",
    submittedAt: "2026-06-20T00:00:00.000Z",
    reviewStartedBy: null,
    reviewStartedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewReasonCode: null,
    reviewComment: null,
    canonicalDriverId: null,
    canonicalVehicleId: null,
    canonicalContractId: null,
    canonicalPolicyId: null,
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
  },
  {
    submissionId: "sup-sub-demo-002",
    fleetPartnerId: "fleet-demo-001",
    submissionType: "vehicle_onboarding",
    status: "in_review",
    revisionNo: 2,
    subjectDriverId: null,
    subjectVehicleId: null,
    submittedBy: "fleet-user-2",
    submittedAt: "2026-06-20T00:10:00.000Z",
    reviewStartedBy: "platform-admin-demo-001",
    reviewStartedAt: "2026-06-20T00:15:00.000Z",
    reviewedBy: null,
    reviewedAt: null,
    reviewReasonCode: "initial_screening",
    reviewComment: "Manual review started.",
    canonicalDriverId: null,
    canonicalVehicleId: null,
    canonicalContractId: null,
    canonicalPolicyId: null,
    createdAt: "2026-06-20T00:10:00.000Z",
    updatedAt: "2026-06-20T00:15:00.000Z",
  },
];

type SubmissionTransitionConfig = {
  nextStatus: SupplySubmissionStatus;
  eventType: SupplyReviewEventRecord["eventType"];
  allowedCurrentStatuses: readonly SupplySubmissionStatus[];
};

@Injectable()
export class SupplyReviewService implements OnModuleInit {
  private submissions = REVIEW_SUBMISSION_SEED.map((submission) => ({
    ...submission,
  }));
  private reviewEvents: SupplyReviewEventRecord[] = [];

  constructor(
    @Optional()
    private readonly supplySubmissionRepository?: SupplySubmissionRepository,
  ) {}

  async onModuleInit() {
    if (!this.supplySubmissionRepository?.isEnabled()) {
      return;
    }

    try {
      const state = await this.supplySubmissionRepository.loadState();
      if (state.submissions.length > 0) {
        this.submissions = state.submissions.map((submission) => ({
          ...submission,
        }));
      }
      this.reviewEvents = state.reviewEvents.map((event) => ({ ...event }));
    } catch (error) {
      this.supplySubmissionRepository.reportPersistenceFailure(
        error,
        "supply review module init",
      );
    }
  }

  async listSubmissions() {
    if (this.supplySubmissionRepository?.isEnabled()) {
      const state = await this.supplySubmissionRepository.loadState();
      return state.submissions;
    }

    return this.submissions.map((submission) => ({ ...submission }));
  }

  async getSubmission(submissionId: string) {
    const submission = await this.findSubmission(submissionId);
    return { ...submission };
  }

  async startSubmissionReview(
    submissionId: string,
    command: SupplyReviewActionCommand,
    reviewerActorId: string,
  ) {
    return this.applyReviewAction(
      submissionId,
      command,
      reviewerActorId,
      {
        nextStatus: "in_review",
        eventType: "review_started",
        allowedCurrentStatuses: ["submitted"],
      },
    );
  }

  async requestRevision(
    submissionId: string,
    command: SupplyReviewActionCommand,
    reviewerActorId: string,
  ) {
    return this.applyReviewAction(
      submissionId,
      command,
      reviewerActorId,
      {
        nextStatus: "needs_revision",
        eventType: "revision_requested",
        allowedCurrentStatuses: ["in_review"],
      },
    );
  }

  async approveSubmission(
    submissionId: string,
    command: SupplyReviewActionCommand,
    reviewerActorId: string,
  ) {
    return this.applyReviewAction(
      submissionId,
      command,
      reviewerActorId,
      {
        nextStatus: "approved",
        eventType: "approved",
        allowedCurrentStatuses: ["in_review"],
      },
    );
  }

  async rejectSubmission(
    submissionId: string,
    command: SupplyReviewActionCommand,
    reviewerActorId: string,
  ) {
    return this.applyReviewAction(
      submissionId,
      command,
      reviewerActorId,
      {
        nextStatus: "rejected",
        eventType: "rejected",
        allowedCurrentStatuses: ["in_review"],
      },
    );
  }

  private async applyReviewAction(
    submissionId: string,
    command: SupplyReviewActionCommand,
    reviewerActorId: string,
    config: SubmissionTransitionConfig,
  ) {
    const normalizedCommand = this.normalizeActionCommand(command);
    const reviewerId = this.requireActorId(reviewerActorId);

    if (this.supplySubmissionRepository?.isEnabled()) {
      return this.supplySubmissionRepository.withTransaction(async (executor) => {
        const current = await this.supplySubmissionRepository!.lockSubmission(
          executor,
          submissionId,
        );
        this.assertExpectedRevision(current, normalizedCommand.expectedRevisionNo);
        this.assertAllowedStatus(current, config);
        if (config.nextStatus === "approved") {
          this.assertReviewerNotSubmitter(current, reviewerId);
        }

        const now = new Date().toISOString();
        const transitionParams = {
          submissionId: current.submissionId,
          fleetPartnerId: current.fleetPartnerId,
          expectedRevisionNo: normalizedCommand.expectedRevisionNo,
          nextStatus: config.nextStatus,
          allowedCurrentStatuses: config.allowedCurrentStatuses,
          reviewReasonCode: normalizedCommand.reasonCode,
          reviewComment: normalizedCommand.comment,
          ...(config.eventType === "review_started"
            ? {
                reviewStartedBy: reviewerId,
                reviewStartedAt: now,
              }
            : {
                reviewedBy: reviewerId,
                reviewedAt: now,
              }),
        };
        const updated =
          await this.supplySubmissionRepository!.transitionSubmissionStatus(
            executor,
            transitionParams,
          );

        await this.supplySubmissionRepository!.persistSubmissionWorkflow(
          executor,
          {
            reviewEvents: [
              this.createReviewEvent(
                updated,
                config.eventType,
                reviewerId,
                normalizedCommand.reasonCode,
                normalizedCommand.comment,
                now,
              ),
            ],
          },
        );

        return updated;
      });
    }

    const current = await this.findSubmission(submissionId);
    this.assertExpectedRevision(current, normalizedCommand.expectedRevisionNo);
    this.assertAllowedStatus(current, config);
    if (config.nextStatus === "approved") {
      this.assertReviewerNotSubmitter(current, reviewerId);
    }

    const now = new Date().toISOString();
    const updated: SupplySubmissionRecord = {
      ...current,
      status: config.nextStatus,
      revisionNo: current.revisionNo + 1,
      reviewReasonCode: normalizedCommand.reasonCode,
      reviewComment: normalizedCommand.comment,
      updatedAt: now,
    };
    if (config.eventType === "review_started") {
      updated.reviewStartedBy = reviewerId;
      updated.reviewStartedAt = now;
    } else {
      updated.reviewedBy = reviewerId;
      updated.reviewedAt = now;
    }

    this.submissions = this.submissions.map((submission) =>
      submission.submissionId === submissionId ? updated : submission,
    );
    this.reviewEvents = [
      this.createReviewEvent(
        updated,
        config.eventType,
        reviewerId,
        normalizedCommand.reasonCode,
        normalizedCommand.comment,
        now,
      ),
      ...this.reviewEvents,
    ];

    return { ...updated };
  }

  private async findSubmission(submissionId: string) {
    if (this.supplySubmissionRepository?.isEnabled()) {
      const state = await this.supplySubmissionRepository.loadState();
      const submission = state.submissions.find(
        (item) => item.submissionId === submissionId,
      );
      if (!submission) {
        throw new ApiRequestError(
          HttpStatus.NOT_FOUND,
          "NOT_FOUND",
          "Supply submission was not found.",
          { submissionId },
        );
      }
      return submission;
    }

    const submission = this.submissions.find(
      (item) => item.submissionId === submissionId,
    );
    if (!submission) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Supply submission was not found.",
        { submissionId },
      );
    }
    return submission;
  }

  private normalizeActionCommand(command: SupplyReviewActionCommand) {
    if (!Number.isInteger(command.expectedRevisionNo) || command.expectedRevisionNo < 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "EXPECTED_REVISION_NO_INVALID",
        "expectedRevisionNo must be a non-negative integer.",
      );
    }

    const reasonCode = command.reasonCode?.trim();
    if (!reasonCode) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "REASON_CODE_REQUIRED",
        "reasonCode is required.",
      );
    }

    return {
      expectedRevisionNo: command.expectedRevisionNo,
      reasonCode,
      comment: command.comment?.trim() || null,
    };
  }

  private requireActorId(actorId?: string | null) {
    const normalized = actorId?.trim();
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ACTOR_ID_REQUIRED",
        "Reviewer actorId is required.",
      );
    }
    return normalized;
  }

  private assertExpectedRevision(
    submission: SupplySubmissionRecord,
    expectedRevisionNo: number,
  ) {
    if (submission.revisionNo !== expectedRevisionNo) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "SUBMISSION_REVISION_CONFLICT",
        "The supply submission revision is stale.",
        {
          submissionId: submission.submissionId,
          expectedRevisionNo,
          actualRevisionNo: submission.revisionNo,
        },
      );
    }
  }

  private assertAllowedStatus(
    submission: SupplySubmissionRecord,
    config: SubmissionTransitionConfig,
  ) {
    if (config.allowedCurrentStatuses.includes(submission.status)) {
      return;
    }

    throw new ApiRequestError(
      HttpStatus.CONFLICT,
      "INVALID_STATE_TRANSITION",
      "The supply submission status transition is not allowed.",
      {
        submissionId: submission.submissionId,
        currentStatus: submission.status,
        nextStatus: config.nextStatus,
        allowedCurrentStatuses: [...config.allowedCurrentStatuses],
      },
    );
  }

  private assertReviewerNotSubmitter(
    submission: SupplySubmissionRecord,
    reviewerActorId: string,
  ) {
    if (submission.submittedBy !== reviewerActorId) {
      return;
    }

    throw new ApiRequestError(
      HttpStatus.FORBIDDEN,
      "REVIEWER_SELF_APPROVAL_DENIED",
      "The submitting actor cannot approve the same supply submission.",
      {
        submissionId: submission.submissionId,
        actorId: reviewerActorId,
      },
    );
  }

  private createReviewEvent(
    submission: SupplySubmissionRecord,
    eventType: SupplyReviewEventRecord["eventType"],
    actorId: string,
    reasonCode: string,
    comment: string | null,
    createdAt: string,
  ): SupplyReviewEventRecord {
    return {
      eventId: randomUUID(),
      submissionId: submission.submissionId,
      revisionNo: submission.revisionNo,
      eventType,
      actorId,
      reasonCode,
      comment,
      createdAt,
    };
  }
}
