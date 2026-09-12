FROM node:22-bookworm-slim

ARG AGE_VERSION=1.2.1
ARG SUPABASE_CLI_VERSION=2.107.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg zstd tar bash \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-17 \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL "https://github.com/FiloSottile/age/releases/download/v${AGE_VERSION}/age-v${AGE_VERSION}-linux-amd64.tar.gz" \
    | tar -xz -C /usr/local/bin --strip-components=1 age/age age/age-keygen \
  && curl -fsSL "https://github.com/supabase/cli/releases/download/v${SUPABASE_CLI_VERSION}/supabase_linux_amd64.tar.gz" \
    | tar -xz -C /usr/local/bin supabase \
  && chmod +x /usr/local/bin/age /usr/local/bin/age-keygen /usr/local/bin/supabase \
  && pg_dump --version \
  && supabase --version \
  && age --version \
  && zstd --version

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY dist ./dist

ENV NODE_ENV=production
USER node
CMD ["node", "dist/backup.js"]
