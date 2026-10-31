import {useAuthStore} from "~/lib/api";
import {getErrorMessage} from "~/lib/utils";
import {type FormEvent, useEffect, useState} from "react";
import {useNavigate, useSearchParams} from "react-router";

export const meta = () => ([
    { title: 'Resumind | Auth' },
    { name: 'description', content: 'Log into your account' },
])

const Auth = () => {
    const { isLoading, user, logIn, register, logOut } = useAuthStore();
    const [searchParams] = useSearchParams();
    const requestedNext = searchParams.get('next') ?? '/';
    // Only allow redirects inside this app.
    const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/';
    const navigate = useNavigate();
    const [isNewUser, setIsNewUser] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if(user && searchParams.has('next')) navigate(next);
    }, [user, next])

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const email = formData.get('email') as string;
        const password = formData.get('password') as string;

        setIsSubmitting(true);
        setError('');
        try {
            await (isNewUser ? register(email, password) : logIn(email, password));
            navigate(next);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <main className="bg-[url('/images/bg-auth.svg')] bg-cover min-h-screen flex items-center justify-center">
            <div className="gradient-border shadow-lg">
                <section className="flex flex-col gap-8 bg-white rounded-2xl p-10">
                    <div className="flex flex-col items-center gap-2 text-center">
                        <h1>Welcome</h1>
                        <h2>Log In to Continue Your Job Journey</h2>
                    </div>
                    {isLoading ? (
                        <button className="auth-button animate-pulse">
                            <p>Loading...</p>
                        </button>
                    ) : user ? (
                        <button className="auth-button" onClick={logOut}>
                            <p>Log Out</p>
                        </button>
                    ) : (
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <div className="form-div">
                                <label htmlFor="email">Email</label>
                                <input type="email" name="email" id="email" placeholder="Email" autoComplete="email" required />
                            </div>
                            <div className="form-div">
                                <label htmlFor="password">Password</label>
                                <input type="password" name="password" id="password" placeholder="Password" autoComplete={isNewUser ? "new-password" : "current-password"} minLength={8} maxLength={72} required />
                            </div>
                            {error && <p className="text-red-600 font-semibold">{error}</p>}
                            <button className="auth-button" type="submit" disabled={isSubmitting}>
                                <p>{isSubmitting ? 'Please wait...' : isNewUser ? 'Create Account' : 'Log In'}</p>
                            </button>
                            <button type="button" className="text-gray-600 cursor-pointer" onClick={() => { setIsNewUser(!isNewUser); setError(''); }}>
                                {isNewUser ? 'Already have an account? Log in' : 'New here? Create an account'}
                            </button>
                        </form>
                    )}
                </section>
            </div>
        </main>
    )
}

export default Auth
