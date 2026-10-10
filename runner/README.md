# Stub agent runner

Plumbing-only image for local execution. It reads callback env vars, POSTs a sample
result to the API, and exits. It does not run Strands, call an LLM, or use connectors.

```bash
docker build -t agent-platform-runner:local .
```

The worker starts this image. The container must be able to reach the API at
`EXECUTION_CALLBACK_BASE_URL` (default `http://host.docker.internal:8000`).
On Linux, the worker passes `--add-host=host.docker.internal:host-gateway`.
