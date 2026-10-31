import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api, useAuthStore } from "~/lib/api";
import { getErrorMessage } from "~/lib/utils";

const WipeApp = () => {
    const { user, isLoading } = useAuthStore();
    const navigate = useNavigate();
    const [resumes, setResumes] = useState<Resume[]>([]);
    const [error, setError] = useState('');

    const loadResumes = async () => {
        const { resumes } = await api.listResumes();
        setResumes(resumes);
    };

    useEffect(() => {
        if (isLoading) return;
        if (!user) {
            navigate("/auth?next=/wipe");
            return;
        }
        loadResumes().catch((err) => setError(getErrorMessage(err)));
    }, [isLoading, user]);

    const handleDelete = async () => {
        try {
            await api.deleteResumes();
            await loadResumes();
        } catch (err) {
            setError(getErrorMessage(err));
        }
    };

    if (isLoading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>Error {error}</div>;
    }

    return (
        <div>
            Authenticated as: {user?.email}
            <div>Existing resumes:</div>
            <div className="flex flex-col gap-4">
                {resumes.map((resume) => (
                    <div key={resume.id} className="flex flex-row gap-4">
                        <p>{resume.companyName || resume.jobTitle || resume.id}</p>
                    </div>
                ))}
            </div>
            <div>
                <button
                    className="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer"
                    onClick={() => handleDelete()}
                >
                    Wipe App Data
                </button>
            </div>
        </div>
    );
};

export default WipeApp;
