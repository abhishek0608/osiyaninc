/**
 * Vercel serverless function: create a Razorpay order.
 * Set env vars in Vercel: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
 * Frontend calls POST /api/create-order with body: { amount, currency?, receipt? }
 * Returns: { orderId }
 */
import Razorpay from 'razorpay'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) {
    return res.status(500).json({ message: 'Razorpay not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.' })
  }

  try {
    const { amount, currency = 'INR', receipt = `rcpt_${Date.now()}` } = req.body || {}
    const amountNum = parseInt(amount, 10)
    if (!amountNum || amountNum < 100) {
      return res.status(400).json({ message: 'Amount must be at least 100 (1 INR in paise)' })
    }

    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret })
    const order = await rzp.orders.create({
      amount: amountNum,
      currency,
      receipt,
    })

    res.status(200).json({ orderId: order.id })
  } catch (err) {
    console.error('Razorpay order create error:', err)
    res.status(500).json({ message: err.message || 'Failed to create order' })
  }
}
