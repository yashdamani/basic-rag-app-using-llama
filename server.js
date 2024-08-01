const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const fs = require('fs').promises;
const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const execPromise = util.promisify(exec);
const multipart = require('@fastify/multipart');
const NodeCache = require('node-cache');

const myCache = new NodeCache({ stdTTL: 100, checkperiod: 120 });

function prettifyError(error) {
  if (error.stderr) {
    const lines = error.stderr.split('\n');
    const errorMessage = lines[lines.length - 2];
    return {
      error: 'An error occurred',
      details: errorMessage,
      type: 'PythonScriptError',
      command: error.cmd,
    };
  }
  return {
    error: 'An unexpected error occurred',
    details: error.message,
    type: error.name,
  };
}

fastify.register(cors, {
  origin: true,
});
fastify.register(multipart);

let jsonlPath = '';

fastify.get('/', async (request, reply) => {
  return { message: 'Hello World' };
});

fastify.get('/process_emails', async (request, reply) => {
  try {
    jsonlPath = '/Users/yashdamani/Desktop/foresight/emails.jsonl';

    await fs.access(jsonlPath);

    const { stdout, stderr } = await execPromise(
      `python rag.py process "${jsonlPath}"`,
    );
    if (stderr) {
      throw new Error(stderr);
    }
    const result = JSON.parse(stdout);
    return { status: result.status };
  } catch (error) {
    fastify.log.error(error);
    return reply
      .code(500)
      .send({ error: 'An error occurred while processing the emails' });
  }
});

fastify.get('/ask', async (request, reply) => {
  try {
    const question = request.query.q;
    if (!question) {
      return reply.code(400).send({ error: 'Question is required' });
    }
    if (!jsonlPath) {
      return reply.code(400).send({ error: 'Please process emails first' });
    }

    const { stdout, stderr } = await execPromise(
      `python rag.py query "${question}" "${jsonlPath}"`,
    );

    console.log('stdout:', stdout);
    console.log('stderr:', stderr);

    let response;
    try {
      response = JSON.parse(stdout);
    } catch (error) {
      console.error('Error parsing JSON:', error);
      return reply
        .code(500)
        .send({ error: 'Error parsing response from Python script' });
    }

    if (response.answer) {
      return { query: question, answer: response.answer };
    } else if (response.error) {
      return reply.code(500).send({ error: response.error });
    } else {
      return reply
        .code(500)
        .send({ error: 'Unexpected response format from Python script' });
    }
  } catch (error) {
    fastify.log.error(error);
    return reply
      .code(500)
      .send({ error: 'An error occurred while processing the question' });
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
