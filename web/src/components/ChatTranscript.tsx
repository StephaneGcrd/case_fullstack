type ChatTranscriptProps = {
  output: string;
};

export function ChatTranscript({ output }: ChatTranscriptProps) {
  return (
    <div className="h-full overflow-y-scroll pb-32">
      <pre>{output}</pre>{" "}
    </div>
  );
}
