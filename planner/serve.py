"""Start the complete app on the port supplied by the hosting provider."""

import os
import uvicorn


def main():
    try:
        port = int(os.environ.get("PORT", "8000"))
        if not 1 <= port <= 65535:
            raise ValueError
    except ValueError:
        raise SystemExit("PORT deve ser um número inteiro entre 1 e 65535.") from None
    uvicorn.run("planner.api:app", host="0.0.0.0", port=port, workers=1)


if __name__ == "__main__":
    main()
