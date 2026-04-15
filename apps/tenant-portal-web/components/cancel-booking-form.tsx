"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CancelBookingFormProps {
  bookingId: string;
}

export function CancelBookingForm({ bookingId }: CancelBookingFormProps) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });

      if (!res.ok) {
        const errText = await res.text();
        setError(`Cancel failed: ${errText}`);
        return;
      }

      router.refresh();
      router.push("/booking-list");
    } catch (e) {
      setError(
        `Cancel failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowDialog(true)}
        className="action-button cancel"
        style={{
          background: "none",
          border: "1px solid #dc3545",
          color: "#dc3545",
          padding: "0.5rem 1rem",
          cursor: "pointer",
          borderRadius: "4px",
        }}
      >
        Cancel Booking
      </button>

      {showDialog && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowDialog(false)}
        >
          <div
            className="modal-content"
            style={{
              backgroundColor: "white",
              padding: "2rem",
              borderRadius: "8px",
              maxWidth: "500px",
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Cancel Booking</h3>
            <p>Booking: {bookingId}</p>

            {error && (
              <div
                className="error-banner"
                style={{
                  backgroundColor: "#f8d7da",
                  color: "#721c24",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  marginBottom: "1rem",
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleCancel}>
              <div style={{ marginBottom: "1rem" }}>
                <label
                  htmlFor="cancel-reason"
                  style={{ display: "block", marginBottom: "0.5rem" }}
                >
                  Reason (optional):
                </label>
                <textarea
                  id="cancel-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowDialog(false)}
                  style={{
                    padding: "0.5rem 1rem",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#dc3545",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Cancelling..." : "Confirm Cancel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
