FROM python:3.12-slim

WORKDIR /app
ENV HOME=/tmp \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY agent_run.py entrypoint.py /app/

USER nobody
ENTRYPOINT ["python", "-u", "/app/entrypoint.py"]
