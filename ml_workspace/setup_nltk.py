import nltk


NLTK_RESOURCES = {
    "tokenizers/punkt": "punkt",
    "corpora/stopwords": "stopwords",
    "corpora/wordnet": "wordnet",
    "corpora/omw-1.4": "omw-1.4",
    "taggers/averaged_perceptron_tagger_eng":
        "averaged_perceptron_tagger_eng",
}


def setup_nltk():
    """
    Ensures all required NLTK resources exist.
    Downloads missing resources automatically.
    """

    print("\n[SyncSpace AI] Checking NLTK resources...\n")

    for resource_path, download_name in NLTK_RESOURCES.items():

        try:
            nltk.data.find(resource_path)

        except LookupError:

            print(f"[NLTK] Downloading missing resource: {download_name}")

            nltk.download(download_name)

    print("\n[SyncSpace AI] NLTK setup complete.\n")