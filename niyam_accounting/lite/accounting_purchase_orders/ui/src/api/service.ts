import axios from 'axios'

export async function fetchOrders() {
  const { data } = await axios.get('/api/purchase-orders')
  return data
}

export async function fetchPending() {
  const { data } = await axios.get('/api/purchase-orders/pending')
  return data
}

export async function fetchReport() {
  const { data } = await axios.get('/api/purchase-orders/report')
  return data
}
