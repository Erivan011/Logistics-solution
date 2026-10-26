"""Export an actual solver run for reproducible, read-only portfolio previews."""

import argparse
import json
from datetime import date
from pathlib import Path
from .demo import demo_scenario
from .optimizer import optimize


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="docs/demo-result.json")
    args = parser.parse_args()
    scenario = demo_scenario(date(2026, 10, 26))
    result = optimize(scenario, 3)
    run = {
        "id": "demo-recorded-run",
        "scenario_id": "demo-sp",
        "scenario_version": 1,
        "created_at": "2026-10-26T14:00:00+00:00",
        "scenario_snapshot": scenario.model_dump(mode="json"),
        "result": result,
    }
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(run, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "output": str(target),
                "metrics": result["plan"]["metrics"],
                "baseline": result["baseline"]["metrics"],
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
