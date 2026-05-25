import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "../../src/health/health.controller";
import { HealthService } from "../../src/health/health.service";
import type {
  UiHealthEnvelope,
  UiHealthDegradedService,
} from "@drts/contracts";

describe("HealthController", () => {
  let healthController: HealthController;
  let healthService: HealthService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            getHealth: vi.fn(),
          },
        },
      ],
    }).compile();

    healthController = app.get<HealthController>(HealthController);
    healthService = app.get<HealthService>(HealthService);
  });

  it("should return a healthy status", async () => {
    const mockHealth: UiHealthEnvelope = {
      status: "healthy",
      lastCheckedAt: new Date().toISOString(),
      degradedServices: [],
    };
    (healthService.getHealth as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockHealth,
    );

    const result = await healthController.getHealth();
    expect(result).toEqual(mockHealth);
    expect(healthService.getHealth).toHaveBeenCalled();
  });

  it("should return a degraded status", async () => {
    const mockDegradedServices: UiHealthDegradedService[] = [
      {
        service: "test_service",
        impact: "Minor impact",
        severity: "minor",
      },
    ];
    const mockHealth: UiHealthEnvelope = {
      status: "degraded",
      lastCheckedAt: new Date().toISOString(),
      degradedServices: mockDegradedServices,
    };
    (healthService.getHealth as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockHealth,
    );

    const result = await healthController.getHealth();
    expect(result).toEqual(mockHealth);
    expect(healthService.getHealth).toHaveBeenCalled();
  });

  it("should return a down status", async () => {
    const mockDegradedServices: UiHealthDegradedService[] = [
      {
        service: "critical_service",
        impact: "Major outage",
        severity: "critical",
      },
    ];
    const mockHealth: UiHealthEnvelope = {
      status: "down",
      lastCheckedAt: new Date().toISOString(),
      degradedServices: mockDegradedServices,
    };
    (healthService.getHealth as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockHealth,
    );

    const result = await healthController.getHealth();
    expect(result).toEqual(mockHealth);
    expect(healthService.getHealth).toHaveBeenCalled();
  });
});
