FROM python:3.13-slim

WORKDIR /app
COPY . .

ENV OA_HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080

CMD ["python", "server.py"]
