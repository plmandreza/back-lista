// =============================================================================
// Backend de Lista de Tarefas — Express + CORS + Supabase
// Pronto para deploy na Vercel (zero config: server.js na raiz + module.exports)
// =============================================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// -----------------------------------------------------------------------------
// Configuração
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TABLE = 'tasks';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Defina SUPABASE_URL e SUPABASE_KEY nas variáveis de ambiente.');
}

const supabase = createClient(SUPABASE_URL || '', SUPABASE_KEY || '', {
  auth: { persistSession: false },
});

const app = express();

// -----------------------------------------------------------------------------
// Middlewares
// -----------------------------------------------------------------------------
// CORS: libera todas as origens por padrão. Para restringir, defina na Vercel:
// CORS_ORIGIN=https://meu-front.vercel.app,http://localhost:5173
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : '*';

app.use(
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'ID inválido.' });
    return null;
  }
  return id;
}

// Monta o objeto apenas com os campos permitidos e válidos
function buildTaskPayload(body, { partial }) {
  const errors = [];
  const payload = {};

  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      errors.push('"title" deve ser um texto não vazio.');
    } else {
      payload.title = body.title.trim();
    }
  } else if (!partial) {
    errors.push('"title" é obrigatório.');
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') {
      errors.push('"description" deve ser texto ou null.');
    } else {
      payload.description = body.description;
    }
  }

  if (body.completed !== undefined) {
    if (typeof body.completed !== 'boolean') {
      errors.push('"completed" deve ser true ou false.');
    } else {
      payload.completed = body.completed;
    }
  }

  return { payload, errors };
}

// -----------------------------------------------------------------------------
// Rotas
// -----------------------------------------------------------------------------

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'API de tarefas rodando' });
});

// READ — listar todas (filtros opcionais: ?completed=true|false&search=texto)
app.get(
  '/tasks',
  asyncHandler(async (req, res) => {
    let query = supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    if (req.query.completed === 'true' || req.query.completed === 'false') {
      query = query.eq('completed', req.query.completed === 'true');
    }
    if (req.query.search) {
      query = query.ilike('title', `%${req.query.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  })
);

// READ — buscar uma tarefa
app.get(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;

    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Tarefa não encontrada.' });

    res.json(data);
  })
);

// CREATE — criar tarefa
app.post(
  '/tasks',
  asyncHandler(async (req, res) => {
    const { payload, errors } = buildTaskPayload(req.body || {}, { partial: false });
    if (errors.length) return res.status(400).json({ errors });

    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();
    if (error) throw error;

    res.status(201).json(data);
  })
);

// UPDATE — PUT (exige title) e PATCH (parcial)
async function updateTask(req, res, partial) {
  const id = parseId(req, res);
  if (id === null) return;

  const { payload, errors } = buildTaskPayload(req.body || {}, { partial });
  if (errors.length) return res.status(400).json({ errors });
  if (!Object.keys(payload).length) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) return res.status(404).json({ error: 'Tarefa não encontrada.' });

  res.json(data);
}

app.put('/tasks/:id', asyncHandler((req, res) => updateTask(req, res, false)));
app.patch('/tasks/:id', asyncHandler((req, res) => updateTask(req, res, true)));

// Alternar concluída/pendente
app.patch(
  '/tasks/:id/toggle',
  asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;

    const { data: current, error: findError } = await supabase
      .from(TABLE)
      .select('completed')
      .eq('id', id)
      .maybeSingle();
    if (findError) throw findError;
    if (!current) return res.status(404).json({ error: 'Tarefa não encontrada.' });

    const { data, error } = await supabase
      .from(TABLE)
      .update({ completed: !current.completed })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    res.json(data);
  })
);

// DELETE — excluir tarefa
app.delete(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;

    const { data, error } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Tarefa não encontrada.' });

    res.status(204).send();
  })
);

// -----------------------------------------------------------------------------
// 404 e tratamento de erros
// -----------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido no corpo da requisição.' });
  }
  console.error(err);
  res.status(500).json({
    error: 'Erro interno do servidor.',
    details: err.message || String(err),
  });
});

// -----------------------------------------------------------------------------
// Inicialização
// Na Vercel o app é exportado e vira uma função; localmente sobe com listen.
// -----------------------------------------------------------------------------
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 API de tarefas rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
