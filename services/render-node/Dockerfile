# FFmpeg render node for Railway.
#
# Built from the repository root so it can share src/lib with the web app:
#   docker build -f services/render-node/Dockerfile -t fvs-render-node .
FROM node:22-slim

# ffmpeg does the encoding; the DejaVu and Liberation families are the fonts
# the caption presets name, and libass resolves them by family at render time.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg \
      fonts-dejavu-core \
      fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && npm install --no-save tsx typescript

COPY tsconfig.json ./
COPY src ./src
COPY services ./services

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "tsx", "services/render-node/main.ts"]
