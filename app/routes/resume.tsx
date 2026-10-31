import {Link, useNavigate, useParams} from "react-router";
import {useEffect, useState} from "react";
import {api, useAuthStore} from "~/lib/api";
import Summary from "~/components/Summary";
import ATS from "~/components/ATS";
import Details from "~/components/Details";
import {getErrorMessage} from "~/lib/utils";

const POLL_INTERVAL_MS = 2000;

export const meta = () => ([
    { title: 'Resumind | Review ' },
    { name: 'description', content: 'Detailed overview of your resume' },
])

const Resume = () => {
    const { user, isLoading } = useAuthStore();
    const { id } = useParams();
    const [imageUrl, setImageUrl] = useState('');
    const [resumeUrl, setResumeUrl] = useState('');
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [error, setErrorState] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        if(!isLoading && !user) navigate(`/auth?next=/resume/${id}`);
    }, [isLoading, user])

    useEffect(() => {
        if(!user || !id) return;

        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;

        // The worker analyzes in the background, so check until it finishes.
        const loadResume = async () => {
            try {
                setErrorState('');
                const { resume } = await api.getResume(id);
                if(stopped) return;

                setImageUrl(resume.imageUrl);
                setResumeUrl(resume.resumeUrl);

                if(resume.status === 'failed') {
                    setErrorState(`Error: ${resume.error || 'The analysis failed.'}`);
                } else if(resume.feedback) {
                    setFeedback(resume.feedback);
                } else {
                    timer = setTimeout(loadResume, POLL_INTERVAL_MS);
                }
            } catch (err) {
                console.error("Failed to load resume:", err);
                if(!stopped) setErrorState(`Error: ${getErrorMessage(err)}`);
            }
        }

        loadResume();

        return () => {
            stopped = true;
            clearTimeout(timer);
        };
    }, [id, user]);

    return (
        <main className="!pt-0">
            <nav className="resume-nav">
                <Link to="/" className="back-button">
                    <img src="/icons/back.svg" alt="logo" className="w-2.5 h-2.5" />
                    <span className="text-gray-800 text-sm font-semibold">Back to Homepage</span>
                </Link>
            </nav>
            <div className="flex flex-row w-full max-lg:flex-col-reverse">
                <section className="feedback-section bg-[url('/images/bg-small.svg') bg-cover h-[100vh] sticky top-0 items-center justify-center">
                    {imageUrl && resumeUrl && (
                        <div className="animate-in fade-in duration-1000 gradient-border max-sm:m-0 h-[90%] max-wxl:h-fit w-fit">
                            <a href={resumeUrl} target="_blank" rel="noopener noreferrer">
                                <img
                                    src={imageUrl}
                                    className="w-full h-full object-contain rounded-2xl"
                                    title="resume"
                                />
                            </a>
                        </div>
                    )}
                </section>
                <section className="feedback-section">
                    <h2 className="text-4xl !text-black font-bold">Resume Review</h2>
                    {error ? (
                        <div className="mt-6 p-6 border border-red-200 rounded-2xl bg-red-50/50 backdrop-blur-sm animate-in fade-in duration-500">
                            <p className="text-red-600 font-semibold text-lg">{error}</p>
                            <Link to="/upload" className="inline-block mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
                                Try uploading again
                            </Link>
                        </div>
                    ) : feedback ? (
                        <div className="flex flex-col gap-8 animate-in fade-in duration-1000">
                            <Summary feedback={feedback} />
                            <ATS score={feedback.ATS.score || 0} suggestions={feedback.ATS.tips || []} />
                            <Details feedback={feedback} />
                        </div>
                    ) : (
                        <img src="/images/resume-scan-2.gif" className="w-full" />
                    )}
                </section>
            </div>
        </main>
    )
}
export default Resume
