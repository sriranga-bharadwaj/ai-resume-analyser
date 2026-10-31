import {type FormEvent, useEffect, useState} from 'react'
import Navbar from "~/components/Navbar";
import FileUploader from "~/components/FileUploader";
import {api, useAuthStore} from "~/lib/api";
import {useNavigate} from "react-router";
import {convertPdfToImage} from "~/lib/pdf2img";
import {getErrorMessage} from "~/lib/utils";

const Upload = () => {
    const { user, isLoading } = useAuthStore();
    const navigate = useNavigate();
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [error, setError] = useState('');
    const [file, setFile] = useState<File | null>(null);

    useEffect(() => {
        if(!isLoading && !user) navigate('/auth?next=/upload');
    }, [isLoading, user])

    const handleFileSelect = (file: File | null) => {
        setFile(file)
    }

    const handleAnalyze = async ({ companyName, jobTitle, jobDescription, file }: { companyName: string, jobTitle: string, jobDescription: string, file: File  }) => {
        setIsProcessing(true);
        setError('');

        setStatusText('Converting to image...');
        const imageFile = await convertPdfToImage(file);
        if(!imageFile.file) {
            setIsProcessing(false);
            return setError('Failed to convert PDF to preview image.');
        }

        setStatusText('Uploading...');
        const form = new FormData();
        form.append('companyName', companyName);
        form.append('jobTitle', jobTitle);
        form.append('jobDescription', jobDescription);
        form.append('resume', file);
        form.append('image', imageFile.file);

        try {
            const { resume } = await api.createResume(form);
            navigate(`/resume/${resume.id}`);
        } catch (err) {
            console.error("Upload error:", err);
            setIsProcessing(false);
            setError(getErrorMessage(err));
        }
    }

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget.closest('form');
        if(!form) return;
        const formData = new FormData(form);

        const companyName = formData.get('company-name') as string;
        const jobTitle = formData.get('job-title') as string;
        const jobDescription = formData.get('job-description') as string;

        if(!file) return;

        handleAnalyze({ companyName, jobTitle, jobDescription, file });
    }

    return (
        <main className="bg-[url('/images/bg-main.svg')] bg-cover">
            <Navbar />

            <section className="main-section">
                <div className="page-heading py-16">
                    <h1>Smart feedback for your dream job</h1>
                    {isProcessing ? (
                        <>
                            <h2>{statusText}</h2>
                            <img src="/images/resume-scan.gif" className="w-full" />
                        </>
                    ) : (
                        <>
                            <h2>Drop your resume for an ATS score and improvement tips</h2>
                            {error && (
                                <div className="mt-6 p-4 border border-red-200 rounded-2xl bg-red-50 text-red-600 font-semibold max-w-xl mx-auto animate-in fade-in duration-300">
                                    Error: {error}
                                </div>
                            )}
                        </>
                    )}
                    {!isProcessing && (
                        <form id="upload-form" onSubmit={handleSubmit} className="flex flex-col gap-4 mt-8">
                            <div className="form-div">
                                <label htmlFor="company-name">Company Name</label>
                                <input type="text" name="company-name" placeholder="Company Name" id="company-name" />
                            </div>
                            <div className="form-div">
                                <label htmlFor="job-title">Job Title</label>
                                <input type="text" name="job-title" placeholder="Job Title" id="job-title" />
                            </div>
                            <div className="form-div">
                                <label htmlFor="job-description">Job Description</label>
                                <textarea rows={5} name="job-description" placeholder="Job Description" id="job-description" />
                            </div>

                            <div className="form-div">
                                <label htmlFor="uploader">Upload Resume</label>
                                <FileUploader onFileSelect={handleFileSelect} />
                            </div>

                            <button className="primary-button" type="submit">
                                Analyze Resume
                            </button>
                        </form>
                    )}
                </div>
            </section>
        </main>
    )
}
export default Upload
