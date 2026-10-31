import {create} from "zustand";

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(url, {credentials: "same-origin", ...init});
    if (res.status === 204) return undefined as T;

    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
    return body as T;
};

const sendJson = <T>(url: string, data: unknown) =>
    request<T>(url, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(data),
    });

export const api = {
    listResumes: () => request<{ resumes: Resume[] }>("/api/resumes"),
    getResume: (id: string) => request<{ resume: Resume }>(`/api/resumes/${id}`),
    createResume: (form: FormData) => request<{ resume: Resume }>("/api/resumes", {method: "POST", body: form}),
    deleteResumes: () => request<void>("/api/resumes", {method: "DELETE"}),
};

interface AuthStore {
    isLoading: boolean;
    user: User | null;
    init: () => Promise<void>;
    logIn: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string) => Promise<void>;
    logOut: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
    isLoading: true,
    user: null,
    init: async () => {
        try {
            const {user} = await request<{ user: User }>("/api/auth/me");
            set({user, isLoading: false});
        } catch {
            set({user: null, isLoading: false});
        }
    },
    logIn: async (email, password) => {
        const {user} = await sendJson<{ user: User }>("/api/auth/login", {email, password});
        set({user});
    },
    register: async (email, password) => {
        const {user} = await sendJson<{ user: User }>("/api/auth/register", {email, password});
        set({user});
    },
    logOut: async () => {
        await request<void>("/api/auth/logout", {method: "POST"});
        set({user: null});
    },
}));
