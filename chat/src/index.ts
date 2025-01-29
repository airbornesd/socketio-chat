import 'express-async-errors';
import './config.js';
import express, {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';
import { errorMiddleware, notFoundMiddleware } from './middleware/error.js';
import { cors, logger } from 'shared';
import routes from './routes/index.js';
import { boot } from './services/boot.js';
import { initSocket } from './socket.js';
import { createServer } from 'http';

const app = express();
const server = createServer(app);

app.use(
  cors({
    credentials: true,
    origin: [
      '*',
      'http://127.0.0.1:5501',
      'http://127.0.0.1',
      'http://localhost:80',
      'http://localhost:5001',
      'https://admin.socket.io/',
    ],
  }) as RequestHandler
);
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use((req, res, next) => {
  logger.info(req.method + ' ' + req.path);
  next();
});

app.use(routes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

const io = initSocket(server);
io.engine.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

io.engine.use(
  cors({
    origin: [
      'http://127.0.0.1:5501',
      'http://localhost:5501',
      'https://admin.socket.io/',
    ],
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['my-custom-header'],
  })
);
app.set('io', io);

const port = process.env.PORT || 80;

boot().then(() =>
  server.listen(port, async () => {
    logger.info('api up and working');
  })
);
