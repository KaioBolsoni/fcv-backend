import { Router } from "express";
import { permitir } from "../middlewares/permitir";
import { utilizacaoController } from "../controllers/utilizacaoController";

const router = Router();

router.get("/", permitir("FCV"), utilizacaoController.listar);
router.get("/:id", permitir("FCV"), utilizacaoController.buscar);
router.post("/", permitir("FCV", "COLABORADOR"), utilizacaoController.criar);
router.put("/:id", permitir("FCV"), utilizacaoController.atualizar);
router.delete("/:id", permitir("FCV"), utilizacaoController.excluir);

export default router;
