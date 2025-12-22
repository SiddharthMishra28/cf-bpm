import { OpenAPIRouter } from '@cloudflare/itty-router-openapi'
import { createCors } from 'itty-router'

export const router = OpenAPIRouter({
  schema: {
    info: {
      title: 'BPM Rule Engine API',
      version: '1.0',
    },
  },
  docs_url: '/',
  redoc_url: '/redoc',
})

const { preflight, corsify } = createCors()

router.all('*', preflight)
