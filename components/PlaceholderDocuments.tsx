'use client'

import { PlusCircleIcon } from "lucide-react";
import { Button } from "./ui/button";
import { useRouter } from "next/navigation";


function PlaceholderDocuments() {
    //check user is pro or not and push to uprade screen 
    const router = useRouter();

    const handleClick = () => {
        router.push("/dashboard/upload");
    }

    return (
        <Button onClick={handleClick} className="flex flex-col items-center justify-center w-64 h-80 rounded-xl bg-gray-200 drop-shadow-md text-gray-400" >

            <PlusCircleIcon className="h-16 w-16'" />
            <p>
                Add a Document
            </p>

        </Button>
    )
}

export default PlaceholderDocuments;