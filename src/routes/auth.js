// Rutas de autenticación: SOLO definen las URLs y a qué función del controlador
// llaman. La lógica está en controllers/authController.js.
import { Router } from 'express'
import {
  iniciarGoogle,
  callbackGoogle,
  callbackGoogleOk,
  logout,
} from '../controllers/authController.js'

export const authRouter = Router()

authRouter.get('/google', iniciarGoogle)
authRouter.get('/google/callback', callbackGoogle, callbackGoogleOk)
authRouter.post('/logout', logout)
