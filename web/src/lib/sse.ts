export type SseEvent = {
  type: string;
  data: Record<string, unknown>;
};

/**
 * Append a new chunk to the buffer and return any complete SSE events.
 * SSE blocks are separated by a blank line (\n\n).
 */
export function parseSseChunk(
  buffer: string,
  chunk: string,
): { events: SseEvent[]; buffer: string } {
  const combined = buffer + chunk;
  const blocks = combined.split("\n\n");

  // Last piece may be incomplete — keep it for the next chunk
  const rest = blocks.pop() ?? "";

  const events: SseEvent[] = [];

  // Parse each complete block for SSE events.
  for (const block of blocks) {
    // Ignore empty or whitespace-only blocks.
    if (!block.trim()) continue;

    // Match the event type and data lines.
    const typeMatch = block.match(/^event: (.+)$/m);
    const dataMatch = block.match(/^data: (.+)$/m);

    // If either is missing, skip this block.
    if (!typeMatch || !dataMatch) continue;

    // Add the parsed event to the events array.
    events.push({
      type: typeMatch[1],
      data: JSON.parse(dataMatch[1]) as Record<string, unknown>,
    });
  }

  return { events, buffer: rest };
}
