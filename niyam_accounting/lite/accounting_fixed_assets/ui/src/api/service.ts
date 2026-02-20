import axios from 'axios'

export async function fetchAssets() {
  const { data } = await axios.get('/api/fixed-assets/register')
  return data
}

export async function fetchCategories() {
  const { data } = await axios.get('/api/asset-categories')
  return data
}

export async function fetchForecast() {
  const { data } = await axios.get('/api/depreciation-forecast')
  return data
}
