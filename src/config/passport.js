import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { prisma } from './databases.js';
import { PasswordService } from '../services/password.service.js';
import { env } from './env.js';

// Local Strategy for Login
passport.use(
    new LocalStrategy(
        {
            usernameField: 'username',
            passwordField: 'password',
        },
        async (username, password, done) => {
            try {
                const user = await prisma.user.findFirst({
                    where: { 
                        OR: [
                            { username: username },
                            { email: username }
                        ]
                    },
                    include: { permissions: true }
                });

                if (!user || user.provider !== 'local' || !user.isActive || user.deletedAt) {
                    return done(null, false, { message: 'Incorrect email or password or account deactivated.' });
                }

                const isValid = await PasswordService.verify(user.password, password);
                if (!isValid) {
                    return done(null, false, { message: 'Incorrect email or password.' });
                }

                return done(null, user);
            } catch (error) {
                return done(error);
            }
        }
    )
);

// JWT Strategy for Authenticated Requests
const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: env.JWT_SECRET,
    passReqToCallback: true,
};

passport.use(
    new JwtStrategy(jwtOptions, async (req, payload, done) => {
        try {
            // Restrict permanent WS tokens to ONLY specific SFU endpoints
            if (payload.type === 'permanent') {
                const basePath = req.originalUrl.split('?')[0];
                
                const isGetAllowed = req.method === 'GET' && (
                    [
                        '/api/v1/sfu/status',
                        '/api/v1/sfu/stats',
                        '/api/v1/sfu/health',
                        '/api/v1/sfu/capabilities',
                        '/api/v1/rooms',           // allow room list for client page
                    ].includes(basePath) ||
                    basePath.match(/^\/api\/v1\/sfu\/rooms\/[^\/]+\/(producers|consumers)$/)
                );
                
                const isDeleteAllowed = req.method === 'DELETE' && (
                    basePath.match(/^\/api\/v1\/sfu\/(producers|consumers)\/[^\/]+$/)
                );
                
                if (!isGetAllowed && !isDeleteAllowed) {
                    return done(null, false, { message: 'Permanent tokens cannot access this API endpoint.' });
                }
            }

            const user = await prisma.user.findUnique({
                where: { id: payload.sub },
                include: { permissions: true }
            });

            if (user && user.isActive && !user.deletedAt) {
                return done(null, user);
            } else {
                return done(null, false);
            }
        } catch (error) {
            return done(error, false);
        }
    })
);

// Google Strategy
if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    const { Strategy: GoogleStrategy } = await import('passport-google-oauth20');
    passport.use(
        new GoogleStrategy(
            {
                clientID: env.GOOGLE_CLIENT_ID,
                clientSecret: env.GOOGLE_CLIENT_SECRET,
                callbackURL: env.GOOGLE_CALLBACK_URL,
            },
            async (accessToken, refreshToken, profile, done) => {
                try {
                    let user = await prisma.user.findFirst({
                        where: { providerId: profile.id, provider: 'google' },
                    });

                    if (!user) {
                        user = await prisma.user.create({
                            data: {
                                email: profile.emails[0].value,
                                firstName: profile.name.givenName,
                                lastName: profile.name.familyName,
                                avatar: profile.photos[0]?.value,
                                provider: 'google',
                                providerId: profile.id,
                                emailVerified: new Date(),
                            },
                        });
                    }
                    return done(null, user);
                } catch (error) {
                    return done(error, null);
                }
            }
        )
    );
}

// GitHub Strategy
if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    const { Strategy: GitHubStrategy } = await import('passport-github2');
    passport.use(
        new GitHubStrategy(
            {
                clientID: env.GITHUB_CLIENT_ID,
                clientSecret: env.GITHUB_CLIENT_SECRET,
                callbackURL: env.GITHUB_CALLBACK_URL,
            },
            async (accessToken, refreshToken, profile, done) => {
                try {
                    let user = await prisma.user.findFirst({
                        where: { providerId: profile.id, provider: 'github' },
                    });

                    if (!user) {
                        user = await prisma.user.create({
                            data: {
                                email: profile.emails?.[0]?.value || `${profile.username}@github.com`,
                                username: profile.username,
                                avatar: profile.photos?.[0]?.value,
                                provider: 'github',
                                providerId: profile.id,
                                emailVerified: new Date(),
                            },
                        });
                    }
                    return done(null, user);
                } catch (error) {
                    return done(error, null);
                }
            }
        )
    );
}

export default passport;
