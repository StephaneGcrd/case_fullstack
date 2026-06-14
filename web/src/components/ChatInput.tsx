import { RiArrowUpLine } from "@remixicon/react";

type ChatInputProps = {
  message: string;
  onMessageChange: (message: string) => void;
  onSend: () => void;
  disabled?: boolean;
};

export function ChatInput({
  message,
  onMessageChange,
  onSend,
  disabled = false,
}: ChatInputProps) {
  const canSend = !disabled && message.trim().length > 0;

  return (
    <div className="fixed inset-x-0 bottom-4 flex justify-center px-4">
      <div className="content-width chat-input-block">
        <textarea
          className="box-border w-full max-w-full resize-none bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
          rows={3}
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) void onSend();
            }
          }}
          placeholder="Type your message…"
        />

        <div className="mt-2 flex justify-end">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            onClick={() => void onSend()}
            disabled={!canSend}
            aria-label="Send message"
          >
            <RiArrowUpLine size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
