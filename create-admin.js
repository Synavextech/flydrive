import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import crypto from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables from project root .env
dotenv.config({ path: join(__dirname, '.env') })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
}

// Initialize Supabase admin client with service role key to bypass RLS
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false
    }
})

async function createOrUpdateAdmin() {
    const rawAdminEmail = (process.env.ADMIN_EMAIL || '').trim()
    const adminEmail = rawAdminEmail.toLowerCase()
    const adminPassword = (process.env.ADMIN_PASSWORD || '').trim()
    const adminFirstName = process.env.ADMIN_FIRST_NAME || 'DriveFlyElectric'
    const adminLastName = process.env.ADMIN_LAST_NAME || 'Admin'

    if (!adminEmail || !adminPassword || adminPassword.length < 12) {
        console.error('❌ ADMIN_EMAIL and a strong ADMIN_PASSWORD (minimum 12 characters) must be set in .env')
        process.exit(1)
    }

    console.log(`🔐 Configuring DriveFlyElectric administrator account for: ${adminEmail}`)

    try {
        // 1. Hash the admin password securely
        const saltRounds = 10
        const hashedPassword = await bcrypt.hash(adminPassword, saltRounds)

        // 2. Check if user already exists (matching both normalized lowercase and legacy casing)
        const candidateEmails = Array.from(new Set([adminEmail, rawAdminEmail]))
        const { data: matchedUsers, error: checkError } = await supabase
            .from('users')
            .select('id, email, role, is_active')
            .in('email', candidateEmails)
            .limit(5)

        if (checkError) {
            throw checkError
        }

        const existingUser =
            (matchedUsers || []).find((u) => String(u.email || '').trim().toLowerCase() === adminEmail) ||
            null

        if (existingUser) {
            console.log(`ℹ️ Existing user found with ID: ${existingUser.id}. Elevating permissions to full ADMIN...`)

            const { data: updatedUser, error: updateError } = await supabase
                .from('users')
                .update({
                    email: adminEmail,
                    password: hashedPassword,
                    role: 'ADMIN',
                    is_active: true,
                    first_name: adminFirstName,
                    last_name: adminLastName,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingUser.id)
                .select()
                .single()

            if (updateError) {
                throw updateError
            }

            console.log(' Admin user elevated successfully!')
            console.log(`   ID: ${updatedUser.id}`)
            console.log(`   Email: ${updatedUser.email}`)
            console.log(`   Role: ${updatedUser.role}`)
            console.log(`   Status: Active (${updatedUser.is_active})`)
            console.log('   Full platform control granted.')
        } else {
            console.log('Creating new administrator account...')
            const newUserId = crypto.randomUUID()

            const { data: newUser, error: insertError } = await supabase
                .from('users')
                .insert({
                    id: newUserId,
                    email: adminEmail,
                    password: hashedPassword,
                    first_name: adminFirstName,
                    last_name: adminLastName,
                    role: 'ADMIN',
                    is_active: true,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .select()
                .single()

            if (insertError) {
                throw insertError
            }

            console.log(' Administrator account created successfully!')
            console.log(`   ID: ${newUser.id}`)
            console.log(`   Email: ${newUser.email}`)
            console.log(`   Role: ${newUser.role}`)
            console.log(`   Status: Active (${newUser.is_active})`)
            console.log('   Full platform control granted.')
        }
    } catch (error) {
        console.error('❌ Error configuring admin user:', error)
        process.exit(1)
    }
}

createOrUpdateAdmin()
