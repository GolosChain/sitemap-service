FROM node:10
WORKDIR /app
COPY ./package*.json ./
RUN npm install --only=production
COPY ./server/ ./server
CMD ["npm", "start"]
