# syntax=docker/dockerfile:1
# FWSlot server (stdlib + numpy) for Amvera Cloud or any Docker host. Starts in DEMO mode: play money, wallet off.
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    FWSLOT_HOST=0.0.0.0 FWSLOT_PORT=3000 FWSLOT_DATA=/data FWSLOT_TRUST_PROXY=1 FWSLOT_WALLET=off
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server ./server
COPY math ./math
EXPOSE 3000
CMD ["python", "server/run.py"]
