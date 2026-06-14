"""Load CSV datasets from the data/ directory.

Logic extracted from main.py so both CLI and API share the same loading rules.
"""

from __future__ import annotations

import re
from pathlib import Path

import pandas as pd


def load_datasets(data_dir: str = "data") -> tuple[dict[str, pd.DataFrame], str]:
    """Load all CSV files from data_dir.

    Returns:
        Tuple of (datasets dict keyed by sanitized table name, info string for prompt).
    """
    data_path = Path(data_dir)
    if not data_path.exists():
        data_path.mkdir(parents=True, exist_ok=True)
        return {}, "No datasets available."

    datasets: dict[str, pd.DataFrame] = {}
    info_lines: list[str] = []

    for csv_file in sorted(data_path.glob("*.csv")):
        name = re.sub(r"[^a-zA-Z0-9_]", "_", csv_file.stem).strip("_").lower()
        df = pd.read_csv(csv_file)
        datasets[name] = df
        cols = ", ".join(df.columns.tolist())
        info_lines.append(
            f"- **{name}** ({df.shape[0]} rows, {df.shape[1]} columns)\n"
            f"  Columns: {cols}"
        )

    if not info_lines:
        return {}, "No datasets available. Add CSV files to the data/ directory."

    return datasets, "\n".join(info_lines)
