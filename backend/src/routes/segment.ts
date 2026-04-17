import { Hono } from "hono";

import { segmentRouteHandler } from "../services/routeHandlers";

export const segmentRoutes = new Hono();

segmentRoutes.post("/", segmentRouteHandler);

