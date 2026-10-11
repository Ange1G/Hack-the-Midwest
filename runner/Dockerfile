FROM python:3.12-slim

WORKDIR /app
ENV HOME=/tmp \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY agent_run.py http_tools.py db_tools.py mcp_tools.py structured_output.py \
     tool_calls.py knowledge_tools.py memory_tools.py delegate_tools.py run_context.py \
     entrypoint.py /app/

USER nobody
ENTRYPOINT ["python", "-u", "/app/entrypoint.py"]