FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
  curl \
  git \
  python3 \
  python3-pip \
  nodejs \
  npm \
  && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /workspace

# Non-root user for security
RUN useradd -m -s /bin/bash sandbox
USER sandbox
WORKDIR /home/sandbox/workspace
