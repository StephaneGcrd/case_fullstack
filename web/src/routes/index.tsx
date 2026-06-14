/** Root route: renders the chat page shell and delegates chat state to useChatSession. */
import { createFileRoute } from "@tanstack/react-router";
import { ChatInput } from "../components/ChatInput";
import { ChatTranscript } from "../components/ChatTranscript";
import { useChatSession } from "../lib/useChatSession";

export const Route = createFileRoute("/")({
  component: ApiClientPage,
});

function ApiClientPage() {
  const { entries, message, setMessage, send, canSend, isOnline } =
    useChatSession();

  return (
    <div className="flex h-full min-h-screen min-w-0 flex-col overflow-x-hidden">
      <div className="">
        <div className="shadow-sm flex h-10 items-center gap-2 px-4 py-2">
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${isOnline ? "bg-green-500" : "bg-gray-400"}`}
            aria-label={isOnline ? "API connected" : "API offline"}
            title={isOnline ? "Connected" : "Offline"}
          />
          <p className="text-sm text-gray-500">Cas pratique - Matr</p>
        </div>
      </div>

      <ChatInput
        message={message}
        onMessageChange={setMessage}
        onSend={send}
        disabled={!canSend}
      />

      <ChatTranscript entries={entries} />
    </div>
  );
}
