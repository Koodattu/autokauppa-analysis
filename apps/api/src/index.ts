import { Hono } from 'hono'

const app = new Hono()

app.get('/health', (c) => {
  return c.json({
    service: 'api',
    status: 'ok',
  })
})

export default {
  port: Number(process.env.PORT ?? 3001),
  fetch: app.fetch,
}
