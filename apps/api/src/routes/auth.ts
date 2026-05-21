import { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../plugins/supabase';

export default async function authRoutes(app: FastifyInstance) {

    // SIGNUP ROUTE
    app.post('/auth/signup', async (request, reply) => {
        const { email, password } = request.body as any;

        if (!email || !password) {
            return reply.status(400).send({ error: 'Email and Password are required' });
        }

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
    });

    // LOGIN ROUTE 
    app.post('/auth/login', async (request, reply) => {
        const { email, password } = request.body as any;

        if (!email || !password) {
            return reply.status(400).send({ error: 'Email and Password are required' });
        }

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
    });
}