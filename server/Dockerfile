# бэкенд «Аура красоты»
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download || true
COPY . .
RUN CGO_ENABLED=0 go build -o /out/aura-server .

FROM alpine:3.20
RUN adduser -D aura && mkdir -p /app/uploads && chown aura /app/uploads
WORKDIR /app
USER aura
COPY --from=build /out/aura-server .
COPY migrations ./migrations
EXPOSE 8080
CMD ["./aura-server"]
