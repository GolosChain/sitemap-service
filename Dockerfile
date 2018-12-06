FROM node:10
WORKDIR /app
COPY ./package*.json ./
RUN npm install --only=production
COPY ./server/ ./server
COPY ./data/ ./data
CMD ["npm", "start"]
