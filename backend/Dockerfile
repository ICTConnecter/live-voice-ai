FROM python:3.9-slim

WORKDIR /backend

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade -r /backend/requirements.txt

COPY ./ .

CMD ["uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "8080"]