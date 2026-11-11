import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config()

const { Client } = pg
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzaWJjeXp6dnFodG1ncHZxYW1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NTY5NjMsImV4cCI6MjEwMDIzMjk2M30.nYZt-Z7wb7W3Fx2Lxx44Fxk6XL3II_LlAjcsCJndLJw'

async function seed() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log('Connected to PostgreSQL for catalog seeding.')

  const res = await fetch('https://xsibcyzzvqhtmgpvqama.supabase.co/rest/v1/products?select=*', {
    headers: { apikey: key, Authorization: 'Bearer ' + key }
  })
  const sourceProducts = await res.json()
  console.log(`Fetched ${sourceProducts.length} products from edrifttrikes.shop.`)

  // Remove old mock sample products
  await client.query("DELETE FROM public.products WHERE id LIKE 'prod_%'")

  for (const sp of sourceProducts) {
    const slug = sp.slug
    let localImg = ''
    const ext = path.extname(sp.hero_image ? sp.hero_image.split('?')[0] : '') || '.webp'
    const filename = slug + ext
    if (fs.existsSync(path.join('client/public/images', filename))) {
      localImg = '/images/' + filename
    }

    let cat = 'trikes'
    const lowerName = sp.name.toLowerCase()
    if (lowerName.includes('jeep') || lowerName.includes('car') || lowerName.includes('willys')) {
      cat = 'Microcars'
    } else if (lowerName.includes('kart') || lowerName.includes('buggy') || lowerName.includes('cross')) {
      cat = 'Go karts'
    } else if (lowerName.includes('dirt') || lowerName.includes('bike') || lowerName.includes('motorcycle') || lowerName.includes('scooter') || lowerName.includes('atv')) {
      cat = 'Dirtbikes'
    } else if (lowerName.includes('trike') || lowerName.includes('drift')) {
      cat = 'trikes'
    }

    const imagesList = localImg ? [localImg] : []
    // Enrich with updated sample images from /public/images
    if (lowerName.includes('4-seater') || lowerName.includes('4-seat')) {
      imagesList.unshift('/images/200cc 4-Seater Off-Road Go Kart 1 - $550.webp')
      imagesList.push('/images/200cc 4-Seater Off-Road Go Kart 3 - $550.webp.webp')
    } else if (lowerName.includes('gc2009')) {
      imagesList.unshift('/images/GC2009 Off-Road Go Kart - $1200.webp')
      imagesList.push('/images/GC2009 Off-Road Go Kart 2 - $1200.webp')
    } else if (lowerName.includes('60v electric dirt bike')) {
      imagesList.unshift('/images/b1-$250.webp')
    } else if (lowerName.includes('125cc dirt bike')) {
      imagesList.unshift('/images/b2 - $400.webp')
    } else if (lowerName.includes('x26 3000w')) {
      imagesList.unshift('/images/b3 $ 400.webp')
    } else if (lowerName.includes('6000w electric dirt bike')) {
      imagesList.unshift('/images/b5 - $280.webp')
    } else if (lowerName.includes('drift kart') || lowerName.includes('drift go kart')) {
      imagesList.push('/images/mm1.webp', '/images/mm2.webp')
    }

    // Fallback if no images found
    if (imagesList.length === 0) {
      imagesList.push('/images/hero1.jpeg')
    }

    const price = sp.price_cents ? sp.price_cents / 100 : 399.0
    const origPrice = sp.compare_at_cents ? sp.compare_at_cents / 100 : Math.round(price * 1.25)
    const sku = 'DFE-' + slug.substring(0, 16).toUpperCase()
    const stock = sp.stock || 25
    const rating = parseFloat((4.85 + Math.random() * 0.14).toFixed(2))
    const reviews = Math.floor(18 + Math.random() * 95)

    const queryText = `
      INSERT INTO public.products (
        id, name, description, price, original_price, sku, stock, category, brand, images,
        is_active, is_new, rating, reviews, shipping_required, average_delivery_time, weight, dimensions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (sku) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        price = EXCLUDED.price,
        original_price = EXCLUDED.original_price,
        stock = EXCLUDED.stock,
        category = EXCLUDED.category,
        brand = EXCLUDED.brand,
        images = EXCLUDED.images,
        is_active = true,
        updated_at = NOW()
    `

    await client.query(queryText, [
      sp.id,
      sp.name,
      sp.description || sp.tagline || 'High-performance electric ride engineered by DriveFlyElectric. Built with reinforced chassis and precision motor tuning.',
      price,
      origPrice,
      sku,
      stock,
      cat,
      'DriveFlyElectric',
      imagesList,
      true,
      sp.is_new || sp.badge === 'NEW',
      rating,
      reviews,
      true,
      '12-20 business days (Nanshan, Shenzhen, Guangdong Province, China Warehouse)',
      sp.top_speed ? parseFloat(sp.top_speed) || 45.0 : 40.0,
      sp.range_miles ? 'Range: ' + sp.range_miles : 'Range: 60-80 km'
    ])
  }

  // Ensure flagship MiniHeliCopters & Microcars with local /images/ media are always present
  const flagshipItems = [
    {
      id: 'dfe_heli_001',
      name: 'AeroVolt X1 Personal Electric MiniHeliCopter',
      description: 'Single-seat ultralight electric rotorcraft with coaxial brushless turbine propulsion, carbon-kevlar airframe, digital flight stabilization, auto-hover avionics, and ballistic recovery parachute.',
      price: 4800.0,
      origPrice: 5600.0,
      sku: 'DFE-HELI-X1',
      stock: 8,
      category: 'mini-helicopter',
      images: ['/images/MicroHelicpter.jpeg'],
      weight: 115.0,
      dimensions: 'Range: 240 km Flight'
    },
    {
      id: 'dfe_heli_002',
      name: 'SkyPulse Twin-Rotor Ultralight MiniHeliCopter',
      description: 'High-endurance compact personal mini-helicopter featuring redundant lithium-aviation battery packs, glass cockpit telemetry display, GPS return-to-home assist, and all-weather composite rotor blades.',
      price: 6200.0,
      origPrice: 7200.0,
      sku: 'DFE-HELI-PRO2',
      stock: 5,
      category: 'mini-helicopter',
      images: ['/images/MicroHelicpter.jpeg'],
      weight: 132.0,
      dimensions: 'Range: 260 km Flight'
    },
    {
      id: 'dfe_micro_001',
      name: 'UrbanPulse GT Enclosed Electric Microcar',
      description: 'All-weather 2-seater enclosed electric microcar with panoramic glass cabin, 72V lithium battery pack, hydraulic disc brakes, LED matrix lighting, backup camera, and digital infotainment display.',
      price: 1100.0,
      origPrice: 1450.0,
      sku: 'DFE-MICRO-EV1',
      stock: 14,
      category: 'Microcars',
      images: ['/images/MicroCCar.jpg', '/images/mercedes1100.mp4'],
      weight: 320.0,
      dimensions: 'Range: 120 km'
    }
  ]

  for (const item of flagshipItems) {
    await client.query(
      `INSERT INTO public.products (
        id, name, description, price, original_price, sku, stock, category, brand, images,
        is_active, is_new, rating, reviews, shipping_required, average_delivery_time, weight, dimensions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DriveFlyElectric', $9, true, true, 4.98, 42, true, '12-20 business days (Nanshan, Shenzhen, Guangdong Province, China Warehouse)', $10, $11)
      ON CONFLICT (sku) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        price = EXCLUDED.price,
        original_price = EXCLUDED.original_price,
        stock = EXCLUDED.stock,
        category = EXCLUDED.category,
        brand = EXCLUDED.brand,
        images = EXCLUDED.images,
        is_active = true,
        updated_at = NOW()`,
      [item.id, item.name, item.description, item.price, item.origPrice, item.sku, item.stock, item.category, item.images, item.weight, item.dimensions]
    )
  }

  // Update existing product brands to DriveFlyElectric
  await client.query("UPDATE public.products SET brand = 'DriveFlyElectric' WHERE brand IS NULL OR brand != 'DriveFlyElectric'")

  const countRes = await client.query('SELECT count(*) FROM public.products')
  console.log(`✅ Successfully seeded catalog! Total products in DB: ${countRes.rows[0].count}`)
  await client.end()
}

seed().catch(err => {
  console.error('Seeding error:', err)
  process.exit(1)
})
