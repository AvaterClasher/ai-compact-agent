FROM alpine:3.21

RUN apk add --no-cache curl bash

# Non-root user for security
RUN adduser -D -s /bin/bash sandbox

# Install Bun as sandbox user
USER sandbox
ENV BUN_INSTALL="/home/sandbox/.bun"
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/home/sandbox/.bun/bin:${PATH}"

WORKDIR /home/sandbox/workspace
