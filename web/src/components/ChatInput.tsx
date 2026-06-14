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
  return (
    <div className="fixed bottom-4 bg-white border-black border-2 p-2 h-32">
      <textarea
        rows={3}
        cols={60}
        value={message}
        onChange={(e) => onMessageChange(e.target.value)}
        placeholder="Type your message…"
      />

      <button type="button" onClick={() => void onSend()} disabled={disabled}>
        Send
      </button>
    </div>
  );
}
