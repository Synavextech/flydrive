import express from 'express'
import { protect } from '../middleware/auth.js'
import {
  getEligibleExchangeCatalog,
  getMyReturns,
  getMyWallet,
  submitReturnRequest
} from '../controllers/walletReturnController.js'

export const walletRouter = express.Router()
walletRouter.use(protect)
walletRouter.get('/', getMyWallet)

export const returnRouter = express.Router()
returnRouter.use(protect)
returnRouter.get('/', getMyReturns)
returnRouter.get('/eligible-products/:orderId', getEligibleExchangeCatalog)
returnRouter.post('/', submitReturnRequest)
