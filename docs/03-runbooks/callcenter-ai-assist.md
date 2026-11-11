# Callcenter AI booking assist

Task: `CALLCENTER-AI-ASSIST-20261111`

Phone bookings are filled in by the AI. A human agent only corrects what is wrong and submits.

- **AI line**: the voice AI answers first. When it cannot finish the booking, it hands the call to a human. The agent's order form opens with everything the AI already collected.
- **Human hotline**: the agent talks with the caller while the AI listens. The AI fills the form live from the call transcript.

The agent always submits the order. The AI never creates an order on the human path.

## What the agent sees

The callcenter page in the ops console shows the following.

- **AI handoffs waiting**: calls the AI passed to a human, most urgent first, with the reason and waiting time. Agents see only calls they may read.
- **AI booking assist panel** for the selected call:
  - The AI's value for each field, with a status: AI filled, please check, confirmed, or edited.
  - What the caller said for each field, plus other values heard (one click to switch).
  - The last few transcript lines.
- **Order form**:
  - Passenger name and phone are prefilled.
  - Pickup and drop-off are geocoded from the AI's text and placed on the map. The agent checks the pin.
  - Pickup time, passenger count, luggage and needs (wheelchair, child seat) go into the driver notes.
- **Rules**:
  - A field the agent changed is never overwritten. A newer AI value is offered next to it.
  - A field the AI marked uncertain blocks submit until the agent confirms it or changes it.
- **KPI**: AI fill accuracy over 30 days, meaning the share of AI-filled fields the agent kept unchanged. The KPI also shows counts of kept, corrected and missed fields.

## API

| Route                                                 | Caller                | Purpose                                                     |
| ----------------------------------------------------- | --------------------- | ----------------------------------------------------------- |
| `GET /callcenter/handoffs`                            | ops, platform         | Open handoffs, filtered by call read access                 |
| `GET /callcenter/sessions/:callId/assist`             | ops, platform         | The call's AI draft (`draft: null` when none)               |
| `POST /callcenter/sessions/:callId/assist/transcript` | system (media worker) | Final ASR segments; the AI re-extracts fields               |
| `POST /callcenter/sessions/:callId/assist/outcomes`   | ops, platform         | Per-field kept / corrected / missed for the submitted order |
| `GET /callcenter/assist/accuracy?since&until`         | ops, platform         | Accuracy and coverage, per field and per source             |

## Storage (V0136)

- **`voice.handoff`**: now the durable handoff queue.
  - Before this change, the queue lived in process memory, in two separate copies: one in the voice module and one in the callcenter module.
  - An API restart lost waiting callers, and agent takeover never found the AI's handoff.
- **`crm.callcenter_assist_drafts`**: one draft per call.
  - The draft holds caller personal data. It expires after `CALLCENTER_ASSIST_RETENTION_DAYS` (default 7, allowed 1–90).
  - Expired rows are hidden from reads and purged automatically.
- **`crm.callcenter_assist_field_outcomes`**: outcomes only. Field values are never stored.

## Field extraction

- **Rules (always on)**: deterministic Mandarin rules for:
  - addresses and landmarks, with pickup or drop-off read from cue words (從 / 在 / 到 / 去 / 上車 / 下車);
  - Taiwanese phone numbers, including spoken digits;
  - names (我姓王 / 王先生);
  - pickup time;
  - passenger count;
  - luggage;
  - wheelchair and child seat;
  - common notes.

  Later speech wins. Corrected values stay as candidates.

- **LLM (opt-in)**: set `CALLCENTER_ASSIST_LLM_ENABLED=true` and point the shared LLM gateway (`LLM_GATEWAY_*`) at a live provider.
  - The transcript is sent to that provider, so enable this only after the data-processing terms are approved.
  - Any LLM failure falls back to the rule result.
- **Voice AI handoff**: fields come from the AI's encrypted dialogue snapshot. Values the caller confirmed during read-back are trusted. Speech before the handoff never overrides them.

## Not done yet: real calls

Everything above runs end to end with sandbox and fixture calls. Real calls depend on the same external gate as `UV-EXEC-028`:

- a phone line or CTI provider and a number;
- a speech recognition account.

On the human hotline, the call audio must also be forked to the media worker while the agent is bridged. With Twilio, for example, that means `<Start><Stream track="both_tracks">` before `<Dial>`, which still has to be verified on a test number.

The media worker side is ready: `AgentAssistTranscriptForwarder` (in `apps/voice-media-worker/src/assist`) batches final ASR results per speaker and posts them to the transcript route. Connecting it to the forked audio stream is part of the telephony integration.
