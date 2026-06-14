"""
Data Analysis Agent — CLI

Interactive command-line interface for the data analysis agent.
Load CSV files from data/, ask questions, and get SQL queries + visualizations.

Usage:
    python main.py
"""

import asyncio
import json
import re
import sys

from dotenv import load_dotenv

load_dotenv()

from agent.agent import create_agent
from agent.context import AgentContext
from api.services.dataset_loader import load_datasets

# ---------------------------------------------------------------------------
# ANSI colors for terminal output
# ---------------------------------------------------------------------------
CYAN = "\033[36m"
YELLOW = "\033[33m"
GREEN = "\033[32m"
RED = "\033[31m"
DIM = "\033[2m"
BOLD = "\033[1m"
RESET = "\033[0m"


# ---------------------------------------------------------------------------
# Thinking tag parser
# ---------------------------------------------------------------------------
def parse_thinking(text: str) -> tuple[str, str]:
    """Extract <thinking> blocks and return (thinking_text, clean_text)."""
    pattern = re.compile(r"<thinking>(.*?)</thinking>", re.DOTALL)
    thinking_parts = pattern.findall(text)
    thinking = "\n".join(t.strip() for t in thinking_parts)
    clean_text = pattern.sub("", text).strip()
    return thinking, clean_text


# ---------------------------------------------------------------------------
# Message display
# ---------------------------------------------------------------------------
def display_messages(messages) -> None:
    """Display the agent's run trace: thinking, tool calls, tool results."""
    from pydantic_ai.messages import (
        ModelRequest,
        ModelResponse,
        TextPart,
        ToolCallPart,
        ToolReturnPart,
    )

    for msg in messages:
        if isinstance(msg, ModelResponse):
            for part in msg.parts:
                if isinstance(part, TextPart) and part.content.strip():
                    thinking, text = parse_thinking(part.content)
                    if thinking:
                        print(f"\n{CYAN}[Thinking]{RESET}")
                        for line in thinking.split("\n"):
                            print(f"  {DIM}{line}{RESET}")

                elif isinstance(part, ToolCallPart):
                    args = (
                        part.args
                        if isinstance(part.args, dict)
                        else json.loads(part.args)
                        if isinstance(part.args, str)
                        else {}
                    )
                    print(f"\n{YELLOW}[Tool: {part.tool_name}]{RESET}")
                    for key, value in args.items():
                        val_str = str(value)
                        if len(val_str) > 300:
                            val_str = val_str[:300] + "..."
                        # Indent multiline values (like SQL)
                        if "\n" in val_str:
                            print(f"  {BOLD}{key}{RESET}:")
                            for vline in val_str.split("\n"):
                                print(f"    {vline}")
                        else:
                            print(f"  {BOLD}{key}{RESET}: {val_str}")

        elif isinstance(msg, ModelRequest):
            for part in msg.parts:
                if isinstance(part, ToolReturnPart):
                    content = str(part.content)
                    if len(content) > 400:
                        content = content[:400] + "..."
                    print(f"  {GREEN}> {content}{RESET}")


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
async def main() -> None:
    datasets, dataset_info = load_datasets()

    if not datasets:
        print(f"{RED}No CSV files found in data/.{RESET}")
        print("Add CSV files to the data/ directory and try again.")
        sys.exit(1)

    print(f"\n{BOLD}Data Analysis Agent — CLI{RESET}")
    print("=" * 40)
    print(f"\nDatasets loaded:\n")
    for name, df in datasets.items():
        cols = ", ".join(df.columns.tolist())
        print(f"  {BOLD}{name}{RESET}  {DIM}({df.shape[0]} rows, {df.shape[1]} columns){RESET}")
        print(f"  {DIM}Columns: {cols}{RESET}\n")

    agent = create_agent(dataset_info)
    context = AgentContext(datasets=datasets, dataset_info=dataset_info)
    message_history = []

    print(f"Ask questions about your data. Type 'quit' to exit.\n")

    while True:
        try:
            question = input(f"{BOLD}You:{RESET} ")
        except (EOFError, KeyboardInterrupt):
            print("\nBye!")
            break

        if question.strip().lower() in ("quit", "exit", "q"):
            print("Bye!")
            break

        if not question.strip():
            continue

        print(f"\n{DIM}Processing...{RESET}")

        try:
            result = await agent.run(
                question,
                deps=context,
                message_history=message_history or None,
            )

            # Display only the new messages from this run
            all_msgs = result.all_messages()
            new_msgs = all_msgs[len(message_history):]
            display_messages(new_msgs)

            # Display final answer
            thinking, answer = parse_thinking(result.output)
            if thinking:
                print(f"\n{CYAN}[Thinking]{RESET}")
                for line in thinking.split("\n"):
                    print(f"  {DIM}{line}{RESET}")
            print(f"\n{BOLD}Assistant:{RESET} {answer}\n")

            # Keep history for multi-turn conversation
            message_history = all_msgs

        except Exception as e:
            print(f"\n{RED}Error:{RESET} {e}\n")


if __name__ == "__main__":
    asyncio.run(main())
