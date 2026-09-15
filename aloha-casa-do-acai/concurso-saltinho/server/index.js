import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { z } from "zod";

const app = express();
const port = process.env.PORT || 10000;
const allowedOrigin = process.env.APP_ORIGIN || "";
app.use(express.json({ limit: "32kb" }));
app.use(cors({ origin: allowedOrigin ? [allowedOrigin] : false, methods: ["GET", "POST"] }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use(express.static("public"));

const corpus = {
  sanitario: "Agente Sanitário Saltinho 2026. Conteúdo: SUS e Leis 8.080/1990 e 8.142/1990; saúde coletiva; vigilância sanitária, áreas de atuação, poder de polícia, SNVS, Anvisa, ação regulatória, controle sanitário de ambientes, produtos e serviços, fases de controle, ações educativas.",
  merendeira: "Merendeira Saltinho 2026. A prova tem somente Língua Portuguesa e Matemática/Raciocínio Lógico: 20 questões de cada. Português: interpretação, sinônimos, antônimos, pontuação, ortografia, classes de palavras, concordância e crase. Matemática: operações, conjuntos, medidas, dinheiro, sistema decimal, múltiplos, divisores, problemas, decimais e porcentagem."
};
const requestSchema = z.object({ cargo: z.enum(["sanitario", "merendeira"]), quantidade: z.number().int().min(1).max(20), dificuldade: z.enum(["facil", "media", "dificil"]).default("media") });

app.get("/health", (_req, res) => res.json({ ok: true, service: "concurso-saltinho-api" }));
app.get("/api/catalog", (_req, res) => res.json({ concurso: "Saltinho SP 01/2026", banca: "AVANÇASP", cargos: ["sanitario", "merendeira"] }));
app.post("/generate", async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pedido inválido." });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: "IA não configurada no servidor." });
  const { cargo, quantidade, dificuldade } = parsed.data;
  const prompt = `Você cria questões inéditas de concurso público brasileiro no estilo objetivo da banca AVANÇASP. Use somente este escopo: ${corpus[cargo]}\nGere ${quantidade} questões de dificuldade ${dificuldade}. Retorne SOMENTE JSON válido no formato {"questoes":[{"materia":"","enunciado":"","opcoes":["","","","",""],"correta":0,"comentario":""}]}. Cada questão tem 5 alternativas, apenas uma correta; correta é índice 0 a 4. Não invente leis, números, órgãos ou exigências que não estejam no escopo. Não reproduza questões protegidas.`;
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-3.8-flash"}:generateContent`;
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.55 } }) });
    if (!response.ok) return res.status(502).json({ error: "Falha no provedor de IA." });
    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    const output = JSON.parse(text);
    if (!Array.isArray(output.questoes) || output.questoes.length !== quantidade) throw new Error("Formato inesperado");
    res.json(output);
  } catch (_error) { res.status(502).json({ error: "Não foi possível gerar questões agora." }); }
});
app.listen(port, () => console.log(`API ativa na porta ${port}`));
