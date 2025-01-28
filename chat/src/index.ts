import 'express-async-errors';
import './config.js';
import express, { RequestHandler } from 'express';
import { errorMiddleware, notFoundMiddleware } from './middleware/error.js';
import { cors, logger } from 'shared';
import routes from './routes/index.js';
import { boot } from './services/boot.js';
import { getIO, initSocket } from './utils/socket.js';
import { createServer } from 'http';

const app = express();
const server = createServer(app);

app.use(cors() as RequestHandler);
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use((req, res, next) => {
  console.log(req.method + ' -- ' + req.path);
  next();
});

app.use(routes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

initSocket(server);
app.locals.io = getIO();

const port = process.env.PORT || 80;

boot().then(() =>
  server.listen(port, async () => {
    logger.info('api up and working');
  })
);
