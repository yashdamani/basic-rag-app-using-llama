const fastify = require('fastify')({ logger: true })
const cors = require('@fastify/cors')
const fs = require('fs').promises
const pdf = require('pdf-parse')
const { exec } = require('child_process')
const util = require('util')
const path = require('path')
const execPromise = util.promisify(exec)
const multipart = require('@fastify/multipart')

function prettifyError(error) {
  if (error.stderr) {
    const lines = error.stderr.split('\n')
    const errorMessage = lines[lines.length - 2]
    return {
      error: 'An error occurred',
      details: errorMessage,
      type: 'PythonScriptError',
      command: error.cmd
    }
  }
  return {
    error: 'An unexpected error occurred',
    details: error.message,
    type: error.name
  }
}

fastify.register(cors, { 
  origin: true
})

fastify.register(multipart)

let pdfTextPath = ''

fastify.get('/', async (request, reply) => {
  return { message: 'Hello World' }
})

fastify.get('/process_pdf', async (request, reply) => {
  try {
    const pdfPath = 'enter_pdf_path'
    const dataBuffer = await fs.readFile(pdfPath)
    const data = await pdf(dataBuffer)

    // Write PDF text to a temporary file
    pdfTextPath = path.join(__dirname, 'temp_pdf_text.txt')
    await fs.writeFile(pdfTextPath, data.text)

    const { stdout, stderr } = await execPromise(`python rag.py process "${pdfTextPath}"`)
    if (stderr) {
      throw new Error(stderr)
    }
    const result = JSON.parse(stdout)
    return { status: result.status }
  } catch (error) {
    fastify.log.error(error)
    return reply.code(500).send({ error: 'An error occurred while processing the PDF' })
  }
})

fastify.get('/ask', async (request, reply) => {
  try {
    const question = request.query.q
    if (!question) {
      return reply.code(400).send({ error: 'Question is required' })
    }
    if (!pdfTextPath) {
      return reply.code(400).send({ error: 'Please process a PDF first' })
    }

    const { stdout, stderr } = await execPromise(`python rag.py query "${question}" "${pdfTextPath}"`)
    if (stderr && !stderr.includes("Number of requested results")) {
      throw new Error(stderr)
    }
    const output = JSON.parse(stdout)
	console.log(output)
    return { query: output.answer.query, answer: output.answer.result }
  } catch (error) {
    fastify.log.error(error)
    return reply.code(500).send({ error: 'An error occurred while processing the question' })
  }
})

const start = async () => {
  try {
    await fastify.listen({ port: 3000 })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()