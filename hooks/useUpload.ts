'use client'

import { generateEmbeddings } from "@/actions/generateEmbeddings";
import { db, storage } from "@/firebase";
import { useUser } from "@clerk/nextjs";
import { doc, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { v4 as uuidv4 } from 'uuid';

export enum StatusText {
    UPLOADING = "Uploading your File..",
    UPLOADED = "It's done, uploaded successfully..!!",
    SAVING = " Saving your file to Dashboard. ",
    GENERATING = " Generating AI Embeddings, This will only take few seconds... ",
}

export type Status = StatusText[keyof StatusText];

function useUpload() {
    const [progress, setProgress] = useState<number | null>(null);
    const [status, setStatus] = useState<Status | null>(null);
    const [fileId, setFileId] = useState<string | null>(null);
    const {user} = useUser();
    const router = useRouter();
    
    const handleUpload = async ( file: File ) => {
        if ( !file || !user ) return;

        //TODO ..free/pro limitations....
        const fileIdtoUploadTo = uuidv4();

        const storageRef = ref(
            storage, 
            `users/${user.id}/files/${fileIdtoUploadTo}`
        );

        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on("state_changed", (snapshot) => {

            const percent = Math.round(
                (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            );

            setStatus(StatusText.UPLOADING);
            setProgress(percent);

        }, 
            (error) => {
                console.error("Error uploading file",error);
            },
            async () => {
                setStatus(StatusText.UPLOADED);

                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                console.log(downloadUrl);

                setFileId(StatusText.SAVING);

                await setDoc(doc(db, "users", user.id, 'files', fileIdtoUploadTo), {
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    doneloadURL: downloadUrl,
                    ref: uploadTask.snapshot.ref.fullPath,
                    createdAt: new Date(),
                });

                setStatus(StatusText.GENERATING); //AI
                await generateEmbeddings(fileIdtoUploadTo);

                setFileId(fileIdtoUploadTo);
            }
        );
    };

    return { progress, status, fileId, handleUpload };
}

export default useUpload;