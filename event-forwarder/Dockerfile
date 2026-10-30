FROM python:3.12-slim-bookworm@sha256:e697c81897302a4c4333bade000d98038fbb21eb064f8ee1fd42d02ebcd9d337
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.lock ./requirements.lock
RUN pip install --no-cache-dir -r requirements.lock \
    && mkdir /spool \
    && chown 10001:10001 /spool \
    && chmod 700 /spool \
    && groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --no-create-home app
COPY main.py settings.py forwarder.py inputs.py status_input.py spool.py ./
USER app
ENTRYPOINT ["python", "main.py"]
CMD ["--check-config"]
