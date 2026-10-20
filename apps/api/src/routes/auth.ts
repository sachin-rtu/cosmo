import { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../plugins/supabase';

// Simple email regex — catches obvious typos, not a full RFC 5322 check
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

export default async function authRoutes(app: FastifyInstance) {

    // SIGNUP ROUTE
    app.post('/auth/signup', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const body = request.body as Record<string, unknown> | null;
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
        const password = typeof body?.password === 'string' ? body.password : '';

        if (!email || !password) {
            return reply.status(400).send({ error: 'Email and password are required' });
        }

        if (!EMAIL_RE.test(email)) {
            return reply.status(400).send({ error: 'Invalid email format' });
        }

        if (password.length < MIN_PASSWORD_LENGTH) {
            return reply.status(400).send({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
        }

        try {
            // create user in supabase auth 
            const { data, error } = await supabaseAdmin.auth.signUp({
                email,
                password,
            });

            if (error) {
                return reply.status(400).send({ error: error.message });
            }

            // insert the new user into public profile using their new AUTH ID
            if (data.user) {
                const { error: profileError } = await supabaseAdmin.from('profiles').insert({
                    id: data.user.id,
                    email: data.user.email
                });
                if (profileError) {
                    app.log.error(profileError);                // we stil return 200 OK because user is already created
                }
            }

            return reply.send({
                message: "User created successfully",
                user: data.user,
                session: data.session
            });
        } catch (err) {
            app.log.error({ err }, 'auth/signup: unexpected error');
            return reply.status(500).send({ error: 'Signup failed' });
        }
    });

    // LOGIN ROUTE 
    app.post('/auth/login', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const body = request.body as Record<string, unknown> | null;
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
        const password = typeof body?.password === 'string' ? body.password : '';

        if (!email || !password) {
            return reply.status(400).send({ error: 'Email and password are required' });
        }

        try {
            // Attempt to Sign In 
            const { data, error } = await supabaseAdmin.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                return reply.status(401).send({ error: error.message });
            }

            // the session object contains JWT(access_token) that we later use to protect routes 
            return reply.send({
                message: "Login successful",
                access_token: data.session
            });
        } catch (err) {
            app.log.error({ err }, 'auth/login: unexpected error');
            return reply.status(500).send({ error: 'Login failed' });
        }
    });
}